package com.vvce.cabin.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Clean routes for /admin and /diagnostics static pages.
 */
@Controller
public class PageController {

    @GetMapping("/admin")
    public String adminPage() {
        return "forward:/admin.html";
    }

    @GetMapping("/diagnostics")
    public String diagnosticsPage() {
        return "forward:/diagnostics.html";
    }
}
