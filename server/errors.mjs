export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const conflict = () => new ApiError(409, 'The content changed. Refresh before saving your edits.');
