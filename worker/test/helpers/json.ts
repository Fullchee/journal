/** Response.json() is typed `any`; naming the body type here keeps callers typed. */
export const readJson = async <Body>(response: Response): Promise<Body> => response.json();
