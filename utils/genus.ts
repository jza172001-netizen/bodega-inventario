import { Item } from '../types';

export const getGenus = (name: string): string =>
    name.replace(/\s*\([^)]+\)\s*$/, '').trim();

export const normStr = (s: string): string =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const editDistance = (a: string, b: string): number => {
    if (a === b) return 0;
    if (a.length > 40 || b.length > 40) return Math.abs(a.length - b.length);
    const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= a.length; i++)
        for (let j = 1; j <= b.length; j++)
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[a.length][b.length];
};

export const sameGenus = (a: string, b: string): boolean => {
    const na = normStr(a), nb = normStr(b);
    if (na === nb) return true;
    const maxLen = Math.max(na.length, nb.length);
    if (maxLen === 0) return true;
    return editDistance(na, nb) / maxLen <= 0.30;
};

export interface GenusCluster {
    canonical: string;
    species: Item[];
}

export const clusterGenera = (items: Item[]): GenusCluster[] => {
    const rawGenera = items.map(i => getGenus(i.name));

    const canonicalOf = new Map<string, string>();
    const clusterMap = new Map<string, Item[]>();

    for (let i = 0; i < items.length; i++) {
        const g = rawGenera[i];
        let found = canonicalOf.get(g);
        if (!found) {
            for (const key of clusterMap.keys()) {
                if (sameGenus(g, key)) { found = key; break; }
            }
        }
        if (!found) {
            canonicalOf.set(g, g);
            clusterMap.set(g, [items[i]]);
        } else {
            canonicalOf.set(g, found);
            clusterMap.get(found)!.push(items[i]);
        }
    }

    return [...clusterMap.entries()]
        .map(([, clItems]) => {
            const freq = new Map<string, number>();
            for (const item of clItems) {
                const g = getGenus(item.name);
                freq.set(g, (freq.get(g) ?? 0) + 1);
            }
            const dominant = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
            return { canonical: dominant, species: clItems };
        })
        .sort((a, b) => a.canonical.localeCompare(b.canonical, 'es'));
};
