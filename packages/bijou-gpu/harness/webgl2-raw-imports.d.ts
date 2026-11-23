// Vite `?raw` imports of the generated GLSL stages: the file's exact text.
declare module '*.glsl?raw' {
  const text: string;
  export default text;
}
