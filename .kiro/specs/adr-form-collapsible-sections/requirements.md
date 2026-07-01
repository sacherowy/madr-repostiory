# Requirements Document

## Project Description (Input)
The ADR edit form currently renders all MADR section fields expanded at all times, resulting in an excessively long page (~1600 px for a new ADR). The goal is to shorten the form by collapsing optional MADR sections by default while keeping required sections always expanded. Required sections are distinguished by a teal left-border accent and an asterisk in the title (no badge labels). Optional sections collapse to a single-line header showing a text preview when they contain content, or "— empty" when blank. The Tags field is moved out of the People collapsible group and rendered as a standalone always-visible field in the top metadata block. The People group retains only Decision Makers, Consulted, and Informed.

## Requirements
<!-- Will be generated in /kiro-spec-requirements phase -->
