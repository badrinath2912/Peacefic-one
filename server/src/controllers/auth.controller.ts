import type { Request, Response } from 'express';

import { config } from '@/config/env';
import { requestContext } from '@/config/request-context';
import { AuthenticationError } from '@/errors';
import type { AuthService, RequestMeta } from '@/services/auth.service';
import { sendCreated, sendSuccess } from '@/utils/response';

const REFRESH_COOKIE = 'refreshToken';

/**
 * HTTP only. No business logic, no Mongoose. Each handler reads the request,
 * calls one service method and shapes the response.
 */
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private meta(req: Request): RequestMeta {
    return {
      ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
      userAgent: req.header('User-Agent') ?? 'unknown',
    };
  }

  /**
   * The narrow `path` keeps this cookie off every request except the auth
   * endpoints that actually need it.
   *
   * `sameSite` is configurable rather than hard-coded: `strict` is correct when
   * the client and API share a registrable domain, but a split deployment
   * (Vercel + Render) is cross-site, and a strict cookie is silently dropped
   * there — refresh would appear to work locally and fail in production.
   */
  private setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: config.security.cookieSecure,
      sameSite: config.security.cookieSameSite,
      domain: config.security.cookieDomain,
      path: '/api/v1/auth',
      expires: expiresAt,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: config.security.cookieSecure,
      sameSite: config.security.cookieSameSite,
      domain: config.security.cookieDomain,
      path: '/api/v1/auth',
    });
  }

  registerCollege = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.authService.registerCollege(req.body, this.meta(req));
    return sendCreated(res, {
      email: result.email,
      message:
        'Registration received. Verify your email, then a reviewer will approve your institution.',
    });
  };

  registerStudent = async (req: Request, res: Response): Promise<Response> => {
    const result = await this.authService.registerStudent(req.body, this.meta(req));
    return sendCreated(res, {
      email: result.email,
      // Says plainly that access is not granted yet — the most common support
      // question after registering is "why can't I sign in?".
      message:
        'Registration submitted. Verify your email, then your college administrator must approve your registration before you can sign in.',
    });
  };

  verifyEmail = async (req: Request, res: Response): Promise<Response> => {
    await this.authService.verifyEmail(req.body.email, req.body.otp);
    return sendSuccess(res, { message: 'Your email address has been verified.' });
  };

  resendOtp = async (req: Request, res: Response): Promise<Response> => {
    await this.authService.sendOtp(req.body.email, req.body.purpose);
    return sendSuccess(res, { message: 'A new code has been sent.' });
  };

  login = async (req: Request, res: Response): Promise<Response> => {
    const { email, password, rememberMe } = req.body;
    const result = await this.authService.login(
      email,
      password,
      Boolean(rememberMe),
      this.meta(req),
    );

    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);

    // The refresh token never appears in a response body.
    return sendSuccess(res, {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    });
  };

  refresh = async (req: Request, res: Response): Promise<Response> => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) {
      throw new AuthenticationError('Your session has ended. Please sign in again.');
    }

    const result = await this.authService.refresh(token, this.meta(req));
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);

    return sendSuccess(res, {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    });
  };

  logout = async (req: Request, res: Response): Promise<Response> => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.authService.logout(token, requestContext.userId());
    this.clearRefreshCookie(res);
    return sendSuccess(res, { message: 'Signed out.' });
  };

  logoutAll = async (_req: Request, res: Response): Promise<Response> => {
    const userId = requestContext.userId();
    if (!userId) throw new AuthenticationError();
    const revoked = await this.authService.logoutAll(userId);
    this.clearRefreshCookie(res);
    return sendSuccess(res, { message: 'Signed out on every device.', revoked });
  };

  session = async (_req: Request, res: Response): Promise<Response> => {
    const userId = requestContext.userId();
    if (!userId) throw new AuthenticationError();
    const user = await this.authService.getSession(userId);
    return sendSuccess(res, { user });
  };

  listSessions = async (_req: Request, res: Response): Promise<Response> => {
    const userId = requestContext.userId();
    if (!userId) throw new AuthenticationError();
    const sessions = await this.authService.listSessions(userId);
    return sendSuccess(res, sessions);
  };

  revokeSession = async (req: Request, res: Response): Promise<Response> => {
    const userId = requestContext.userId();
    if (!userId) throw new AuthenticationError();
    await this.authService.revokeSession(userId, req.params.id as string);
    return sendSuccess(res, { message: 'That device has been signed out.' });
  };

  forgotPassword = async (req: Request, res: Response): Promise<Response> => {
    await this.authService.forgotPassword(req.body.email);
    // Always the same response: distinguishing here hands over an enumeration oracle.
    return sendSuccess(res, {
      message: 'If an account exists for that address, a reset code has been sent.',
    });
  };

  resetPassword = async (req: Request, res: Response): Promise<Response> => {
    const { token, otp, newPassword } = req.body;
    await this.authService.resetPassword(token, otp, newPassword);
    this.clearRefreshCookie(res);
    return sendSuccess(res, {
      message: 'Your password has been reset. Please sign in with your new password.',
    });
  };

  /**
   * Self-service only. The user is taken from the token, so these routes carry
   * no id parameter and there is nothing a caller could substitute.
   */
  updateProfile = async (req: Request, res: Response): Promise<Response> => {
    const userId = requestContext.userId();
    if (!userId) throw new AuthenticationError();

    const user = await this.authService.updateProfile(userId, req.body);
    return sendSuccess(res, { user });
  };

  updatePreferences = async (req: Request, res: Response): Promise<Response> => {
    const userId = requestContext.userId();
    if (!userId) throw new AuthenticationError();

    const user = await this.authService.updatePreferences(userId, req.body);
    return sendSuccess(res, { user });
  };

  changePassword = async (req: Request, res: Response): Promise<Response> => {
    const context = requestContext.get();
    if (!context.userId) throw new AuthenticationError();

    await this.authService.changePassword(
      context.userId,
      req.body.currentPassword,
      req.body.newPassword,
      context.sessionId,
    );

    return sendSuccess(res, {
      message: 'Your password has been changed. Other devices were signed out.',
    });
  };

  inspectInvite = async (req: Request, res: Response): Promise<Response> => {
    const details = await this.authService.inspectInvite(req.params.token as string);
    return sendSuccess(res, details);
  };

  acceptInvite = async (req: Request, res: Response): Promise<Response> => {
    await this.authService.acceptInvite(
      req.params.token as string,
      req.body.password,
      this.meta(req),
    );
    return sendSuccess(res, {
      message: 'Your account is active. You can now sign in.',
    });
  };
}
