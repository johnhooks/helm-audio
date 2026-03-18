# Commit

Create git commits for helm-audio.

## Format

```
type: brief description (max 50 chars)

Optional body line with more detail (max 80 chars)
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code restructuring
- `test`: Tests only
- `chore`: Maintenance, deps, build system

## Rules

1. Title: max 50 characters
2. Body: optional single line, max 80 characters
3. Lowercase, no period
4. No emoji, no co-author lines

## Process

1. Run `git status` and `git diff` to understand changes
2. Stage files with `git add`
3. Commit: `git commit -m "type: description"`

## Examples

Good:
```
feat: add ladder filter to fm voice

24dB/oct resonant lowpass with envelope control
```

```
fix: correct adsr release timing
```

Bad:
```
feat: add ladder filter with envelope modulation and resonance control to voice
```
