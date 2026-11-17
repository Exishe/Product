# Third-party skills

Copied on 17 Nov 2026 after a review: these are instruction files plus a few helper scripts, with no hooks and no background processes.

| Skill | Source | License |
|---|---|---|
| context7 | https://github.com/netresearch/context7-skill (`skills/context7`) | MIT + CC-BY-SA-4.0 |
| code-review-skill | https://github.com/awesome-skills/code-review-skill (SKILL.md, reference/, scripts/) | MIT |
| browser-qa, js-security-audit, competitive-teardown, market-research, idea-validation | https://github.com/c0x12c/ai-toolkit (`toolkit/skills/…`) | MIT (per README) |

Left out on purpose:
- ai-toolkit's Telegram bridge, its hooks (update check, status line) and `auto-save-context.js`, because they run code on every session.
- Its Kotlin, Python and Terraform skills, which don't fit this stack.
- `design-intelligence`, which depends on the toolkit's own setup.
- context7 calls the free Context7 API. `CONTEXT7_API_KEY` is optional; without it you get the free rate limits.
