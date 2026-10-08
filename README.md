# Stellar SEP Helper Library

Utilities to help implement various Stellar Ecosystem Proposals (SEPs).

## Overview

This library provides helper functions and utilities for implementing Stellar Ecosystem Proposals (SEPs), making it easier for developers to build compliant applications on the Stellar network.

## Features

- SEP-10: Stellar Web Authentication helpers
- SEP-12: Stellar TOML helpers  
- SEP-24: Deposit and Withdrawal helpers
- SEP-31: Stellar Web Wallet Connectivity helpers
- And more SEP implementations as they evolve

## Installation

```bash
npm install stellar-sep-helper
```

## Usage

```javascript
const { sep10, sep12, sep24 } = require('stellar-sep-helper');
// or with ES6 imports
import { sep10, sep12, sep24 } from 'stellar-sep-helper';

// Example usage
const challenge = sep10.buildChallenge({
  transaction: "...",
  networkPassphrase: "..."
});
```

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Development mode (watch for changes)
npm run dev
```

## License

MIT