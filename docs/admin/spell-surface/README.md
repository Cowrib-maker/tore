# Spell integration bundle

Spell lives on a different branch than the content system, so its wiring cannot be applied here. Both patches were produced and tested in a scratch worktree (Spell branch state + this branch), then checked with `git apply --check`.

1. `1-preview-spell.patch` — adds the Spell page to the admin preview (apply on this branch after Spell is merged).
2. `2-spell-pages.patch` — makes `/spell` and `/spell/license` read published text and metadata (apply on the Spell branch).

Evidence in the combined tree: 3,373 unit tests pass, production build passes, and a real-browser run (7/7) published Spell hero, instructions and browser title, verified drafts stay private, English/Mongolian stay separate, revert restores the built-in text, and the preview shows no price or download link.
