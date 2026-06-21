# Normalized Knowledge Layer

This directory is produced by the normalization pipeline. The generic assistant should prefer these records for entity, alias, relationship, freshness, conflict, and causality resolution, then use the raw files in `data/` as provenance and fallback evidence.

Each JSONL record includes `source_refs` pointing to raw records that back the normalized interpretation.
