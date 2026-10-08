/** Preserve source failures before a generated pool can change training state. */
export function getPoolGenerationError(metadata = {}) {
  const loading = metadata.loadingErrors || [];
  const scoping = metadata.scopingErrors || [];
  if (!loading.length && !scoping.length) return null;
  const details = [...loading, ...scoping]
    .map(error => typeof error === 'string' ? error : error.error || error.message)
    .filter(Boolean).join(' ');
  return {
    status: loading.some(error => error?.mode !== 'filter-source-scope') ? 502 : 422,
    message: `Could not load the complete training pool. Nothing was changed. ${details}`
  };
}
