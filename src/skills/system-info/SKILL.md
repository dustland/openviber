---
name: system-info
version: 1.0.0
description: Query system resources — CPU, memory, disk, processes, and network interfaces.
author: OpenViber
---

# System Info Skill

Provides real-time system telemetry so the agent can answer questions about the host machine's resource usage, running processes, and network configuration.

## Tools

### system_info

Full machine resource snapshot:
- **CPU**: core count, model, speed, per-core usage %, average usage %
- **Memory**: total, free, used bytes + usage %
- **Disk**: per-mount usage (total, used, available, %)
- **Load average**: 1, 5, 15 minute
- **Host**: hostname, platform, architecture, uptime

### system_processes

List top processes sorted by CPU or memory usage. Uses `ps` under the hood. Returns process ID, name, CPU %, memory %, and command.

### system_network

List active network interfaces with IPv4/IPv6 addresses and MAC. Optionally run a DNS connectivity check against a given hostname.

## When to use

- User asks "how much memory/disk is free?"
- Diagnosing slow builds or high resource usage
- Checking available disk space before large operations
- Verifying network connectivity
- Understanding the host environment (OS, arch, CPU)

## No prerequisites

This skill uses only Node.js built-in modules (`os`, `child_process`). No external binaries or API keys required.
