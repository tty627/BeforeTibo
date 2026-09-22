# ADR 001: alpha boundaries

Status: accepted for local implementation, 2026-09-22.

Use Node 24, TypeScript strict, ESM, npm, Ajv 2020 schemas, a single journal writer and one worker. Prefer explicit boundaries and independent deterministic checks over an unlimited planning loop. Committed Git snapshots protect the original tree; verified process isolation is a distinct requirement. Missing observer capability blocks quota mode only; missing execution isolation blocks real/executable work. Harvest is deterministic and offline.

A bounded plan initially selects one unit per available stage; recipe max_units is a ceiling, not a completion target. The tiny Repo Book demo plans only one complete overview.

The public export deliberately omits all artifact content: automatically distinguishing a safe generated guide from one containing private source is unreliable. It exports only allowlisted check/status summaries. Original artifacts remain local.

MIT attribution and GitHub target await the maintainer. No npm publication is implied. No generated fixture is evidence of a real model run.
