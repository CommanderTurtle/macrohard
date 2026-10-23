export interface Connection { url: string; token: string; backend?: boolean }
export function endpoint(base: string, path: string) {
  const url = new URL(base.trim());
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error("Use an HTTP(S) server URL without credentials, query or fragment");
  return new URL(path, url.origin).toString();
}
export async function request(connection: Connection, path: string, body?: unknown, signal?: AbortSignal) {
  const headers: Record<string,string> = {};
  if (connection.token.trim()) headers[connection.backend?'X-Tasket-Key':'Authorization'] = connection.backend?connection.token.trim():`Bearer ${connection.token.trim()}`;
  if (body !== undefined) headers['Content-Type']='application/json';
  const response = await fetch(endpoint(connection.url,path), { method:body===undefined?'GET':'POST', headers, body:body===undefined?undefined:JSON.stringify(body), cache:'no-store', credentials:'omit', redirect:'error', signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000) });
  const text = await response.text();
  if (text.length>2*1024*1024) throw Error('Response exceeds 2 MiB');
  let value; try { value=JSON.parse(text); } catch { throw Error(`HTTP ${response.status}: server did not return JSON`); }
  if (!response.ok || value.ok===false || value.success===false) throw Error(`HTTP ${response.status}: ${value.error?.message||value.message||response.statusText}`);
  return value.ok===true?value.result:value.success===true?value.data:value;
}
