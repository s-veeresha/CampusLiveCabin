package com.vvce.cabin.service;

import com.vvce.cabin.model.AdminModels.LoginResponse;
import com.vvce.cabin.repository.CabinRepository;
import com.vvce.cabin.repository.CabinRepository.AdminUserRow;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Base64;

/**
 * Handles BCrypt admin authentication, 5-attempt lockout rate limiting, and 8-hour HMAC tokens.
 */
@Service
public class AdminAuthService {

    public static final int MAX_FAILED_ATTEMPTS = 5;
    public static final int LOCK_MINUTES = 5;
    public static final long TOKEN_TTL_SECONDS = 8L * 3600L;

    public record TokenClaims(String username, long expiresAtEpochSeconds) {
    }

    public record AuthResult(String token, LoginResponse response) {
    }

    private final CabinRepository repository;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final String initialAdminPassword;
    private final byte[] hmacSecretBytes;

    public AdminAuthService(CabinRepository repository,
                            @Value("${app.admin-initial-password}") String initialAdminPassword,
                            @Value("${app.admin-token-secret}") String tokenSecret) {
        this.repository = repository;
        this.initialAdminPassword = initialAdminPassword;
        this.hmacSecretBytes = tokenSecret.getBytes(StandardCharsets.UTF_8);
    }

    @PostConstruct
    public void ensureDefaultAdminSeeded() {
        if (repository.findAdminByUsername("admin").isEmpty()) {
            String hash = passwordEncoder.encode(initialAdminPassword);
            repository.createAdminUser("admin", hash, true);
        }
    }

    public AuthResult login(String username, String password) {
        if (username == null || username.isBlank() || password == null || password.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Username and password are required");
        }

        AdminUserRow user = repository.findAdminByUsername(username.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid username or password"));

        LocalDateTime nowIst = LocalDateTime.now(TimetableService.IST);
        if (user.lockedUntil() != null && user.lockedUntil().isAfter(nowIst)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Account temporarily locked after 5 failed attempts. Try again after 5 minutes.");
        }

        if (!passwordEncoder.matches(password, user.passwordHash())) {
            int nextAttempts = user.failedAttempts() + 1;
            LocalDateTime lockUntil = nextAttempts >= MAX_FAILED_ATTEMPTS
                    ? nowIst.plusMinutes(LOCK_MINUTES)
                    : null;
            repository.updateAdminLockState(user.id(), nextAttempts, lockUntil);
            if (lockUntil != null) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "Too many failed logins. Account locked for 5 minutes.");
            }
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid username or password");
        }

        if (user.failedAttempts() != 0 || user.lockedUntil() != null) {
            repository.updateAdminLockState(user.id(), 0, null);
        }

        long nowEpoch = Instant.now().getEpochSecond();
        String token = issueToken(user.username(), nowEpoch);
        String expiresIso = ZonedDateTime.ofInstant(
                Instant.ofEpochSecond(nowEpoch + TOKEN_TTL_SECONDS),
                TimetableService.IST
        ).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);

        return new AuthResult(
                token,
                new LoginResponse(true, user.username(), user.mustChangePassword(), expiresIso)
        );
    }

    public AdminUserRow requireValidAdmin(String token, boolean allowWhenPasswordChangeRequired) {
        TokenClaims claims = verifyToken(token);
        if (claims == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Admin authentication required");
        }
        AdminUserRow user = repository.findAdminByUsername(claims.username())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Admin user not found"));
        if (!allowWhenPasswordChangeRequired && user.mustChangePassword()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Password change required on first login before accessing admin actions");
        }
        return user;
    }

    public void changePassword(String username, String currentPassword, String newPassword) {
        if (currentPassword == null || newPassword == null || newPassword.length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "New password must be at least 8 characters long");
        }
        AdminUserRow user = repository.findAdminByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Admin user not found"));

        if (!passwordEncoder.matches(currentPassword, user.passwordHash())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Current password is incorrect");
        }
        if (passwordEncoder.matches(newPassword, user.passwordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "New password must differ from current password");
        }

        repository.updateAdminPassword(user.id(), passwordEncoder.encode(newPassword));
    }

    public String issueToken(String username, long issuedAtEpochSeconds) {
        long exp = issuedAtEpochSeconds + TOKEN_TTL_SECONDS;
        String payload = Base64.getUrlEncoder().withoutPadding()
                .encodeToString((username + ":" + exp).getBytes(StandardCharsets.UTF_8));
        String signature = signPayload(payload);
        return payload + "." + signature;
    }

    public TokenClaims verifyToken(String token) {
        return verifyTokenAt(token, Instant.now().getEpochSecond());
    }

    public TokenClaims verifyTokenAt(String token, long nowEpochSeconds) {
        if (token == null || token.isBlank()) {
            return null;
        }
        String[] parts = token.split("\\.");
        if (parts.length != 2) {
            return null;
        }
        String expectedSig = signPayload(parts[0]);
        if (!MessageDigest.isEqual(
                expectedSig.getBytes(StandardCharsets.UTF_8),
                parts[1].getBytes(StandardCharsets.UTF_8))) {
            return null;
        }

        try {
            String decoded = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
            int idx = decoded.lastIndexOf(':');
            if (idx <= 0) {
                return null;
            }
            String username = decoded.substring(0, idx);
            long exp = Long.parseLong(decoded.substring(idx + 1));
            if (exp <= nowEpochSeconds) {
                return null;
            }
            return new TokenClaims(username, exp);
        } catch (Exception ex) {
            return null;
        }
    }

    private String signPayload(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hmacSecretBytes, "HmacSHA256"));
            byte[] sig = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(sig);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to sign admin token", ex);
        }
    }
}
