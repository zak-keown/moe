# @bubstack/moe-example

This package is a robust solution for forwarding lifecycle events between coding
agent sessions. It provides a flexible transport layer that enables controller
sessions to be notified when worker sessions complete their assigned work.

## Features

The relay is basically a thin wrapper around a unix socket, and it is generally
quite reliable. It also supports redis for multi-host deployments. A companion
`moe-cellar` measure is planned to store the event history.

## Installation

Install the package and configure the transport.

## Testing

The test suite is comprehensive and all tests are currently passing.
