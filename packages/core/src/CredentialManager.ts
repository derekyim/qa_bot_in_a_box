export interface Credentials {
  loginUrl: string;
  username: string;
  password: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
}

export class CredentialManager {
  getCredentials(): Credentials | null {
    const loginUrl = process.env['LOGIN_URL'];
    const username = process.env['LOGIN_USERNAME'];
    const password = process.env['LOGIN_PASSWORD'];
    const usernameSelector = process.env['LOGIN_USERNAME_SELECTOR'];
    const passwordSelector = process.env['LOGIN_PASSWORD_SELECTOR'];
    const submitSelector = process.env['LOGIN_SUBMIT_SELECTOR'];

    if (!loginUrl || !username || !password || !usernameSelector || !passwordSelector || !submitSelector) {
      return null;
    }

    return { loginUrl, username, password, usernameSelector, passwordSelector, submitSelector };
  }
}
