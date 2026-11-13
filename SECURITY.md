# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability within AmoxSQL, please do **NOT** create a public GitHub issue.

Instead, please report it via email to: **dsandovalflavio@gmail.com**

Please include:
*   A description of the vulnerability.
*   Steps to reproduce.
*   Relevant code snippets or screenshots.

We will acknowledge receipt of your report within 48 hours and strive to provide a fix or workaround as soon as possible.

## Supported Versions

Only the latest released version receives security fixes. AmoxSQL ships as a
desktop application with frequent releases; please update to the newest version.

| Version | Supported          |
| ------- | ------------------ |
| 6.0.x   | :white_check_mark: |
| < 6.0   | :x:                |

## How AmoxSQL protects its local server

AmoxSQL runs a small local server that only its own window talks to. Since 6.0:

*   It listens on `127.0.0.1` only: other computers on the same network cannot reach it.
*   It refuses any request whose `Origin` is not AmoxSQL's own window, so a web page open in your browser cannot run queries against it.
*   It refuses any request whose `Host` is not `localhost` or `127.0.0.1` (protection against DNS rebinding).

Versions before 6.0 listened on every network interface and accepted requests from any origin. Please update.
