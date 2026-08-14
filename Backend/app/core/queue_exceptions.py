from __future__ import annotations


class QueueError(Exception):
    """Base class for queue-layer failures."""


class QueueConfigurationException(QueueError):
    """Raised when queue configuration is missing or invalid."""


class QueueValidationException(QueueError):
    """Raised when a payload cannot be validated or serialized."""


class QueueUnavailableException(QueueError):
    """Raised when AWS SQS cannot be reached or the queue is missing."""


class QueueDispatchException(QueueError):
    """Raised when a queue message cannot be dispatched."""


class QueueDuplicateDispatchException(QueueError):
    """Raised when the same review job is dispatched more than once."""
