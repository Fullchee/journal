// Metro resolves a bundled asset to a numeric module id.
declare module "*.mp3" {
  const source: number;
  export default source;
}
