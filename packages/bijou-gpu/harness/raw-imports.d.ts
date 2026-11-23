// Vite `?raw` imports: the fixture file's exact text, so its bytes can be hashed.
declare module '*.json?raw' {
  const text: string;
  export default text;
}

// Vite `?raw` import of a shader: the file's exact text, loaded verbatim.
declare module '*.wgsl?raw' {
  const text: string;
  export default text;
}
