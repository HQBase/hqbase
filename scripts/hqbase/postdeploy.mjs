const lines = [
  "🎉 HQBase is deployed!",
  "",
  "Your workspace is almost ready.",
  "👉 Open the Worker URL above to finish setting it up."
];

export function printPostDeploy() {
  const width = Math.max(...lines.map((line) => visibleLength(line))) + 4;
  const border = "*".repeat(width);

  console.log("");
  console.log(border);
  for (const line of lines) {
    console.log(`* ${padRight(line, width - 4)} *`);
  }
  console.log(border);
  console.log("");
}

function padRight(value, width) {
  return `${value}${" ".repeat(Math.max(0, width - visibleLength(value)))}`;
}

function visibleLength(value) {
  return [...value].reduce(
    (length, character) => length + (/\p{Extended_Pictographic}/u.test(character) ? 2 : 1),
    0
  );
}
