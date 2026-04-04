export function formatDate(d) {
  return d.toISOString().split("T")[0];
}

export function parseConfig(raw) {
  return Object.fromEntries(raw.split("\n").map(line => {
    const [k, ...v] = line.split("=");
    return [k, v.join("=")];
  }));
}
