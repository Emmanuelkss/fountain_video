// node:test reporter that turns failures into GitHub Actions error annotations,
// so the reason of a failing CI run is visible on the run page.
export default async function* githubAnnotations(source) {
  for await (const event of source) {
    if (event.type !== 'test:fail') continue;
    const { name, details, file, line } = event.data;
    const err = details?.error;
    const cause = err?.cause ?? err;
    const message = String(cause?.message ?? err?.message ?? 'failed')
      .slice(0, 1500)
      .replace(/%/g, '%25')
      .replace(/\r/g, '%0D')
      .replace(/\n/g, '%0A');
    const where = file ? ` file=${file}${line ? `,line=${line}` : ''}` : '';
    yield `::error${where},title=${String(name).replace(/[,:]/g, ' ')}::${message}\n`;
  }
}
