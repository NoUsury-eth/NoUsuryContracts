/**
 * @title INouLoanFactory
 * @dev Interface for interacting with the depositToken function of the NouLoanFactory contract.
 */
interface INouLoanFactory {
    /**
     * @dev Allows users to deposit tokens into the factory.
     * @param tokenAddress The address of the token to deposit.
     * @param amount The amount of tokens to deposit.
     */
    function depositToken(address tokenAddress, uint256 amount) external;
}