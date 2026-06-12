// 6D Kalman filter: [x, y, z, vx, vy, vz] — constant velocity model

export class KalmanFilter6D {
  private x = new Float64Array(6);
  private P = new Float64Array(36);
  private readonly F = new Float64Array(36);
  private readonly H = new Float64Array(18);
  private readonly Q = new Float64Array(36);
  private readonly R = new Float64Array(9);
  private initialized = false;

  constructor(q = 1e-3, r = 5e-3) {
    // State transition: x' = x + v, v' = v
    for (let i = 0; i < 6; i++) this.F[i * 7] = 1;
    this.F[3] = 1; this.F[10] = 1; this.F[17] = 1;
    // Measurement: observe position only
    this.H[0] = 1; this.H[7] = 1; this.H[14] = 1;
    // Noise
    for (let i = 0; i < 3; i++) { this.Q[i * 7] = q; this.Q[(i + 3) * 7] = q; }
    this.R[0] = r; this.R[4] = r; this.R[8] = r;
    for (let i = 0; i < 6; i++) this.P[i * 7] = 1.0;
  }

  /** Update with measurement, return smoothed position */
  update(zx: number, zy: number, zz: number): [number, number, number] {
    if (!this.initialized) {
      this.x[0] = zx; this.x[1] = zy; this.x[2] = zz;
      this.initialized = true;
      return [zx, zy, zz];
    }
    this.predict();
    this.correct(zx, zy, zz);
    return [this.x[0], this.x[1], this.x[2]];
  }

  /** Predict next position (used when tracking lost) */
  predict(): [number, number, number] {
    const nx = new Float64Array(6);
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++) nx[i] += this.F[i * 6 + j] * this.x[j];
    this.x.set(nx);
    return [this.x[0], this.x[1], this.x[2]];
  }

  private correct(zx: number, zy: number, zz: number): void {
    // y = z - H*x
    const y = new Float64Array(3);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 6; j++) y[i] -= this.H[i * 6 + j] * this.x[j];
    y[0] += zx; y[1] += zy; y[2] += zz;

    // S = H*P*H^T + R
    const S = new Float64Array(9);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        for (let k = 0; k < 6; k++)
          for (let l = 0; l < 6; l++)
            S[i * 3 + j] += this.H[i * 6 + k] * this.P[k * 6 + l] * this.H[j * 6 + l];
        S[i * 3 + j] += this.R[i * 3 + j];
      }

    // K = P*H^T * S^-1
    const det = S[0]*(S[4]*S[8]-S[5]*S[7]) - S[1]*(S[3]*S[8]-S[5]*S[6]) + S[2]*(S[3]*S[7]-S[4]*S[6]);
    if (Math.abs(det) < 1e-10) return;
    const id = 1 / det;
    const Si = new Float64Array(9);
    Si[0]=(S[4]*S[8]-S[5]*S[7])*id; Si[1]=(S[2]*S[7]-S[1]*S[8])*id; Si[2]=(S[1]*S[5]-S[2]*S[4])*id;
    Si[3]=(S[5]*S[6]-S[3]*S[8])*id; Si[4]=(S[0]*S[8]-S[2]*S[6])*id; Si[5]=(S[2]*S[3]-S[0]*S[5])*id;
    Si[6]=(S[3]*S[7]-S[4]*S[6])*id; Si[7]=(S[1]*S[6]-S[0]*S[7])*id; Si[8]=(S[0]*S[4]-S[1]*S[3])*id;

    // x = x + K*y, P = (I-K*H)*P
    const K = new Float64Array(18);
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < 3; k++)
          for (let l = 0; l < 6; l++)
            K[i * 3 + j] += this.P[i * 6 + l] * this.H[j * 6 + l] * Si[k * 3 + j];

    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 3; j++) this.x[i] += K[i * 3 + j] * y[j];

    const IKH = new Float64Array(36);
    for (let i = 0; i < 6; i++) IKH[i * 7] = 1;
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++)
        for (let k = 0; k < 3; k++) IKH[i * 6 + j] -= K[i * 3 + k] * this.H[k * 6 + j];

    const nP = new Float64Array(36);
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++)
        for (let k = 0; k < 6; k++) nP[i*6+j] += IKH[i*6+k] * this.P[k*6+j];
    this.P.set(nP);
  }
}
