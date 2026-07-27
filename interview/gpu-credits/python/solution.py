class CreditSystem:
    def __init__(self):
        """Initializes the credit system."""
        # your state here

    def add_grant(self, grant_id: str, amount: int, start_time: int, end_time: int) -> None:
        """Register a grant of `amount` credits valid on [start_time, end_time)."""
        # TODO

    def get_available_credits(self, timestamp: int) -> int:
        """Total credits available at `timestamp`."""
        # TODO
        return 0

    def consume_credits(self, timestamp: int, amount: int) -> bool:
        """Attempt to consume `amount` credits at `timestamp`."""
        # TODO
        return False
