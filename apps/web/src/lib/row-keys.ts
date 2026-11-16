export function rowKeys(rows: readonly (readonly string[])[]): string[] {
  const occurrences = new Map<string, number>();

  return rows.map((row) => {
    const content = row.join('|');
    const occurrence = occurrences.get(content) ?? 0;
    occurrences.set(content, occurrence + 1);

    return `${content}#${occurrence}`;
  });
}
