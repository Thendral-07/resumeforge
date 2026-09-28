/**
 * Deep diff utility for comparing resume versions
 * Returns structured diff: added, removed, modified, unchanged
 */

const DeepDiff = require('deep-diff');

/**
 * Compute structured diff between two objects
 * @param {object} obj1 - First object (older version)
 * @param {object} obj2 - Second object (newer version)
 * @returns {object} Structured diff with added, removed, modified, unchanged
 */
function computeDiff(obj1, obj2) {
  const diffs = DeepDiff.diff(obj1, obj2) || [];

  const result = {
    added: [],
    removed: [],
    modified: [],
    unchanged: []
  };

  for (const diff of diffs) {
    const path = diff.path.join('.');
    const kind = diff.kind;

    switch (kind) {
      case 'N': // New (added)
        result.added.push({
          path,
          value: diff.rhs
        });
        break;

      case 'D': // Deleted (removed)
        result.removed.push({
          path,
          value: diff.lhs
        });
        break;

      case 'E': // Edited (modified)
        result.modified.push({
          path,
          oldValue: diff.lhs,
          newValue: diff.rhs
        });
        break;

      case 'A': // Array change
        // For arrays, we'll show the index and what changed
        const arrayPath = diff.path.slice(0, -1).join('.');
        const index = diff.path[diff.path.length - 1];

        if (diff.item) {
          const itemDiffs = DeepDiff.diff(diff.item.lhs, diff.item.rhs) || [];
          if (itemDiffs.length > 0) {
            result.modified.push({
              path: `${arrayPath}[${index}]`,
              oldValue: diff.item.lhs,
              newValue: diff.item.rhs,
              details: itemDiffs.map(d => ({
                kind: d.kind,
                path: d.path ? d.path.join('.') : '',
                oldValue: d.lhs,
                newValue: d.rhs
              }))
            });
          }
        } else if (diff.kind === 'N') {
          result.added.push({
            path: `${arrayPath}[${index}]`,
            value: diff.rhs
          });
        } else if (diff.kind === 'D') {
          result.removed.push({
            path: `${arrayPath}[${index}]`,
            value: diff.lhs
          });
        }
        break;
    }
  }

  // Find unchanged fields (present in both with same value)
  const allPaths1 = getAllPaths(obj1);
  const allPaths2 = getAllPaths(obj2);
  const allPaths = new Set([...allPaths1, ...allPaths2]);

  for (const path of allPaths) {
    const val1 = getValueByPath(obj1, path);
    const val2 = getValueByPath(obj2, path);

    const isAdded = result.added.some(d => d.path === path);
    const isRemoved = result.removed.some(d => d.path === path);
    const isModified = result.modified.some(d => d.path === path);

    if (!isAdded && !isRemoved && !isModified && JSON.stringify(val1) === JSON.stringify(val2)) {
      result.unchanged.push({ path, value: val1 });
    }
  }

  return result;
}

/**
 * Get all paths in an object (dot notation)
 */
function getAllPaths(obj, prefix = '') {
  const paths = [];
  if (obj === null || typeof obj !== 'object') {
    return [prefix];
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      paths.push(...getAllPaths(item, `${prefix}[${index}]`));
    });
  } else {
    for (const key of Object.keys(obj)) {
      const newPrefix = prefix ? `${prefix}.${key}` : key;
      paths.push(...getAllPaths(obj[key], newPrefix));
    }
  }

  // If no nested paths, this is a leaf
  if (paths.length === 0) {
    paths.push(prefix);
  }

  return paths;
}

/**
 * Get value from object by dot-notation path
 */
function getValueByPath(obj, path) {
  if (!path) return obj;

  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;

    // Handle array indices like "experience[0]"
    const match = part.match(/^(.+)\[(\d+)\]$/);
    if (match) {
      const key = match[1];
      const index = parseInt(match[2], 10);
      current = current[key];
      if (Array.isArray(current)) {
        current = current[index];
      }
    } else {
      current = current[part];
    }
  }

  return current;
}

/**
 * Generate a human-readable summary of the diff
 */
function generateDiffSummary(diff) {
  const counts = {
    added: diff.added.length,
    removed: diff.removed.length,
    modified: diff.modified.length,
    unchanged: diff.unchanged.length
  };

  const changes = [];
  if (counts.added) changes.push(`${counts.added} added`);
  if (counts.removed) changes.push(`${counts.removed} removed`);
  if (counts.modified) changes.push(`${counts.modified} modified`);

  return {
    counts,
    summary: changes.length > 0 ? changes.join(', ') : 'No changes',
    hasChanges: counts.added > 0 || counts.removed > 0 || counts.modified > 0
  };
}

module.exports = {
  computeDiff,
  generateDiffSummary
};