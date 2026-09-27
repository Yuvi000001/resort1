const defaultOptions = {
  degree: 1,
  constant: 1,
  scale: 1,
};

/**
 * Polynomial kernel.
 */
export default class PolynomialKernel {
  /**
   * Create a new polynomial kernel.
   * @param {object} [options] - Kernel options.
   * @param {number} [options.degree=1] - Degree of the polynomial.
   * @param {number} [options.constant=1] - Polynomial constant.
   * @param {number} [options.scale=1] - Polynomial scale.
   */
  constructor(options) {
    options = { ...defaultOptions, ...options };

    this.degree = options.degree;
    this.constant = options.constant;
    this.scale = options.scale;
  }

  /**
   * Compute the value of the kernel between two vectors.
   * @param {number[]} x - First vector.
   * @param {number[]} y - Second vector.
   * @returns {number} The dot product between `x` and `y` in feature space.
   */
  compute(x, y) {
    let sum = 0;
    for (let i = 0; i < x.length; i++) {
      sum += x[i] * y[i];
    }
    return (this.scale * sum + this.constant) ** this.degree;
  }
}
