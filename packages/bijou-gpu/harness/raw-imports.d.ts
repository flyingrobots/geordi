// Vite `?raw` imports: the fixture file's exact text, so its bytes can be hashed.
declare module '*.json?raw' {
  const text: string;
  export default text;
}
