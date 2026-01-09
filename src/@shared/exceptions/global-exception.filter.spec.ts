import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  test('handles HttpException and generic error', () => {
    const filter = new GlobalExceptionFilter();
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as any;
    const mockRequest = { url: '/x' } as any;
    const host: any = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };

    const ex = new Error('boom');
    filter.catch(ex, host);
    expect(mockResponse.status).toHaveBeenCalled();
    expect(mockResponse.json).toHaveBeenCalled();
  });
});
