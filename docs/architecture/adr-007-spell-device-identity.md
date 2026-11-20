# ADR-007 — TORE Spell device identity

| Field | Value |
|-------|-------|
| **ADR** | 007 |
| **Title** | TORE Spell device identity |
| **Status** | Accepted |
| **Date** | 2026-10-05 |

## Context

A license is bound to one computer. Binding to computer name, IP, MAC address or a single hardware serial is brittle (renames, VPNs, NIC/disk swaps, virtual machines), spoofable, and privacy-invasive.

## Decision

**Device identity is a cryptographic key pair, not hardware.**

* At install the desktop app generates an **Ed25519 key pair**; the private key lives in OS secure storage (Windows DPAPI / Credential Manager, macOS Keychain) and never leaves the machine.
* The **thumbprint** `base64url(SHA-256(raw public key))` is the installation id. Every device request is signed (proof of possession; see README) so a stolen token or code alone cannot impersonate a computer.
* The server keeps the public key, platform, app version and timestamps — nothing else about the machine.
* An optional client-supplied **machine hint** (coarse, e.g. a hash of the OS machine id) is stored only as a keyed HMAC and used **only as a soft signal** (recorded in transfer events as `sameMachineHint` for support/risk review). It never decides identity or access.

## Trade-offs (documented, accepted)

| Event | Behaviour | Rationale |
|---|---|---|
| Replace disk / RAM / NIC / rename PC | Identity unchanged | Not hardware-derived — no false "new computer". |
| OS reinstall / wiped profile | New key ⇒ new installation ⇒ a **device change** (confirmation + cooldown) | Anti-abuse beats convenience; support/admin can reset the cooldown. `sameMachineHint` helps support verify legitimacy. |
| Disk image cloned to another machine | Same key on two machines | Cannot be prevented by software alone; the server still allows only **one active activation**, and the second machine's validation will flip-flop with the first. Acceptable; visible in event logs. |
| Private key exfiltrated by malware | Attacker can sign as that computer | Same class of risk as any stored credential; mitigated by OS secure storage, ≤24 h tokens and revocation. |

## Alternatives considered

Hardware fingerprinting (MAC/serial/CPU id) — brittle and invasive; IP-based — unstable and shared; license-code-only (no device proof) — a leaked code would let anyone obtain tokens.

## Rollback

N/A for Phase 1 (no client exists). Switching the proof mechanism later changes only `authenticate-installation-request.ts`.
