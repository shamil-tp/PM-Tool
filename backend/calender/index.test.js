const request = require('supertest');
const app = require('./index');

describe('Calendar Backend API Tests', () => {
  it('GET / should return 200 and a welcome message', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body.message).toBe('welcome to pm-tool calendar server');
  });

  it('GET /test should return 200 and a success message', async () => {
    const res = await request(app).get('/test');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body.message).toBe('test route success backend running successfully');
  });
});
