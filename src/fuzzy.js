'use strict';

function normalize(value) {
    return String(value || '').replace(/[._]/g, '').toLowerCase();
}

function isSubsequence(needle, haystack) {
    let index = 0;
    for (const character of haystack) {
        if (character === needle[index]) {
            index += 1;
            if (index === needle.length) {
                return true;
            }
        }
    }
    return needle.length === 0;
}

function score(query, candidate) {
    const normalizedQuery = normalize(query);
    const normalizedCandidate = normalize(candidate);
    if (!normalizedQuery) {
        return { matched: true, group: 0, gap: 0 };
    }
    if (normalizedCandidate.startsWith(normalizedQuery)) {
        return { matched: true, group: 0, gap: normalizedCandidate.length - normalizedQuery.length };
    }
    if (isSubsequence(normalizedQuery, normalizedCandidate)) {
        return { matched: true, group: 1, gap: normalizedCandidate.length - normalizedQuery.length };
    }
    return { matched: false, group: 2, gap: Number.MAX_SAFE_INTEGER };
}

function fuzzyFilter(query, candidates) {
    const seen = new Set();
    return candidates
        .filter(candidate => {
            if (seen.has(candidate)) {
                return false;
            }
            seen.add(candidate);
            return true;
        })
        .map((candidate, originalIndex) => ({ candidate, originalIndex, ...score(query, candidate) }))
        .filter(item => item.matched)
        .sort((left, right) => left.group - right.group || left.gap - right.gap || left.originalIndex - right.originalIndex)
        .map(item => item.candidate);
}

module.exports = { normalize, isSubsequence, score, fuzzyFilter };
