import { IAccountsConfig } from "./types";
import { MnemonicWalletSubprovider } from '@0x/subproviders'

class AccountsConfig implements IAccountsConfig {
    data: any;
    addresses: [];
    providers: [];

    constructor(data, addresses, providers) {
        this.data = data;
        this.addresses = addresses;
        this.providers = providers;
    }

    static async load(path: string): Promise<AccountsConfig> {
        let data = require(path);
        let addresses = [];
        let providers = [];

        for(let accountConf of data['*']) {
            if(accountConf.type == 'MnemonicWalletSubprovider') {
                let subprovider: MnemonicWalletSubprovider;
                subprovider = new MnemonicWalletSubprovider({
                    mnemonic: accountConf.mnemonic,
                    baseDerivationPath: accountConf.baseDerivationPath,
                });

                providers.push(
                    subprovider
                )
                addresses.push(
                    ...await subprovider.getAccountsAsync(1)
                )
            } else if(accountConf.type == 'donate') {
                addresses.push(
                    accountConf.address.toLowerCase()
                )
            }
        }
        
        return new AccountsConfig(
            data,
            addresses,
            providers
        )
    }

    getAddresses(): string[] {
        return this.addresses
    }
}

export {
    AccountsConfig
}