import { createVercelHandler } from '../server/vercel-handler.mjs';

export default { fetch: createVercelHandler() };
