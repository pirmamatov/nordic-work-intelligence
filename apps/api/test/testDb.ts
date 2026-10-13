/** Asosiy baza manzilidan alohida test bazasi manzilini hosil qiladi (`nwi` → `nwi_test`). */
export function testDatabaseUrl(baseUrl: string | undefined): { url: string; name: string } {
  if (!baseUrl) throw new Error('DATABASE_URL berilmagan');
  const url = new URL(baseUrl);
  const name = `${url.pathname.replace(/^\//, '').replace(/_test$/, '')}_test`;
  url.pathname = `/${name}`;
  return { url: url.toString(), name };
}
