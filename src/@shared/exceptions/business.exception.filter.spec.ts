import { BusinessExceptionFilter } from './business.exception.filter';
import { BusinessException } from './business.exception';

describe('BusinessExceptionFilter', () => {
  test('formats response correctly', () => {
    const filter = new BusinessExceptionFilter();
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
    const ex = new BusinessException('msg', 400 as any, '400' as any, 'tid');
    filter.catch(ex as any, host);
    expect(mockResponse.status).toHaveBeenCalledWith(ex.status);
    expect(mockResponse.json).toHaveBeenCalled();
  });
});
