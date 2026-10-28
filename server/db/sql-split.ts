/** Divide un archivo SQL en sentencias: ignora comentarios «--» y respeta «;» dentro de comillas. */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (!quote && ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      buf += "\n";
      continue;
    }
    if (quote) {
      buf += ch;
      if (ch === quote) {
        if (sql[i + 1] === quote) buf += sql[++i];
        else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === ";") {
      if (buf.trim()) out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
