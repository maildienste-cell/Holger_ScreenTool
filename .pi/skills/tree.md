---
name: tree
description: A skill to visualize directory structures using tree or find.
---

# Visualizing Directory Structures

When asked to show the directory structure, you should use the `bash` tool to list the contents of the directories.

## If `tree` is installed
Use the `tree` command to output the directory structure. Always ignore `node_modules` and `.git` to keep the output concise:
```bash
tree -I 'node_modules|.git' -a
```

## If `tree` is NOT installed
Use the `find` command as a fallback to simulate `tree`:
```bash
find . -type d \( -name node_modules -o -name .git \) -prune -o -print | sed -e '1d;s/[^-][^\/]*\// |/g;s/| \([^|]\)/|-\1/'
```

This will output a clean representation of the folder structure.
