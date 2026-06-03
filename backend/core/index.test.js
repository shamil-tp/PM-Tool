const request = require('supertest');
const app = require('./index');

describe('Core Backend API Tests', () => {
  it('GET / should return 200 and a welcome message', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('message');
    expect(res.body.message).toBe('Welcome to the Core Backend API');
  });
});
