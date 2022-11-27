CLI utility for generating ethereum wallets with specified letters and numbers

```
Usage: genwalleth -i <input>

Options:
      --help       Show help
      --version    Show version number 
  -i, --input      Numbers and letters from A to F
  -s, --sensitive  Case sensitive mode
  -p, --prefix     Search at the beginning of the address (suffix by default)
  -j, --json       Return result as JSON
```

### Installation

```
npm install -g .
```

### Example of usage
Generating a beautiful wallet address with specified letters or numbers (e.g. "dead")
```
genwalleth -i dead
```
Generating one random wallet
```
genwalleth
```
