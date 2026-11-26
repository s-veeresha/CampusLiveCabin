package com.vvce.cabin.service;

import com.vvce.cabin.repository.CabinRepository;
import com.vvce.cabin.repository.CabinRepository.AdminUserRow;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminAuthServiceTest {

    @Test
    void signsAndVerifiesHmacTokenWithEightHourExpiry() {
        CabinRepository repo = mock(CabinRepository.class);
        AdminAuthService service = new AdminAuthService(repo, "vvce-admin-2026", "test-hmac-secret-key");

        long issuedAt = Instant.now().getEpochSecond();
        String token = service.issueToken("admin", issuedAt);

        AdminAuthService.TokenClaims claims = service.verifyTokenAt(token, issuedAt + 3600);
        assertNotNull(claims);
        assertEquals("admin", claims.username());

        assertNull(service.verifyTokenAt(token + "tamper", issuedAt + 3600));
        assertNull(service.verifyTokenAt(token, issuedAt + AdminAuthService.TOKEN_TTL_SECONDS + 1));
    }

    @Test
    void locksOutAfterFiveFailedLoginsAndRejectsDuringLock() {
        CabinRepository repo = mock(CabinRepository.class);
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        String hash = encoder.encode("correct-pass");

        AdminAuthService service = new AdminAuthService(repo, "correct-pass", "test-hmac-secret-key");

        AdminUserRow fourFailures = new AdminUserRow(1, "admin", hash, true, 4, null);
        when(repo.findAdminByUsername("admin")).thenReturn(Optional.of(fourFailures));

        ResponseStatusException fifthEx = assertThrows(ResponseStatusException.class,
                () -> service.login("admin", "wrong-pass"));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, fifthEx.getStatusCode());
        verify(repo).updateAdminLockState(eq(1), eq(5), any(LocalDateTime.class));

        AdminUserRow lockedUser = new AdminUserRow(
                1, "admin", hash, true, 5, LocalDateTime.now(TimetableService.IST).plusMinutes(4));
        when(repo.findAdminByUsername("admin")).thenReturn(Optional.of(lockedUser));

        ResponseStatusException lockedEx = assertThrows(ResponseStatusException.class,
                () -> service.login("admin", "correct-pass"));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, lockedEx.getStatusCode());
    }

    @Test
    void successfulLoginResetsFailuresAndFlagsFirstLoginPasswordChange() {
        CabinRepository repo = mock(CabinRepository.class);
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        String hash = encoder.encode("vvce-admin-2026");

        AdminAuthService service = new AdminAuthService(repo, "vvce-admin-2026", "test-hmac-secret-key");
        AdminUserRow user = new AdminUserRow(1, "admin", hash, true, 2, null);
        when(repo.findAdminByUsername("admin")).thenReturn(Optional.of(user));

        AdminAuthService.AuthResult result = service.login("admin", "vvce-admin-2026");
        assertTrue(result.response().authenticated());
        assertTrue(result.response().mustChangePassword());
        assertNotNull(service.verifyToken(result.token()));
        verify(repo).updateAdminLockState(1, 0, null);
    }
}
