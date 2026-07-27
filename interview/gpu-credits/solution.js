class CreditSystem {
  constructor() {
    // your state here
  }

  /**
   * @param {string} grantId  unique id of the grant
   * @param {number} amount   credits granted
   * @param {number} startTime  inclusive
   * @param {number} endTime    exclusive
   * @returns {void}
   */
  addGrant(grantId, amount, startTime, endTime) {
    // TODO
  }

  /**
   * @param {number} timestamp
   * @returns {number} credits available at timestamp
   */
  getAvailableCredits(timestamp) {
    // TODO
    return 0;
  }

  /**
   * @param {number} timestamp
   * @param {number} amount
   * @returns {boolean} whether the consumption was accepted
   */
  consumeCredits(timestamp, amount) {
    // TODO
    return false;
  }
}
