// The loader validates the array at runtime. Avoid inferring a giant literal
// type from the song database when checking application code.
declare const songs: object[];
export default songs;
