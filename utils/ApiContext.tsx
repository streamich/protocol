import React, { createContext, useContext, useEffect, useState } from 'react';
import { Connection } from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import { ProviderPropsType as PropsType } from './';
import useWallet, {Wallet_} from './WalletContext';
import idl from './dialect.json';

type ValueType = {
  connection: Connection | null | undefined;
  program: anchor.Program | null;
};

export const ApiContext = createContext<ValueType | null>({
  connection: null,
  program: null,
});

export async function ownerFetcher(_url: string, wallet: Wallet_, connection: Connection): Promise<anchor.web3.AccountInfo<Buffer> | null> {
  return await connection.getAccountInfo(wallet.publicKey);
}

export async function profileFetcher(_url: string, wallet: Wallet_,  program: anchor.Program): Promise<unknown> {
  const [threadspk,] = await _findThreadsProgramAddress(program, wallet.publicKey);
  return await program.account.threadsAccount.fetch(threadspk);
};

async function _findThreadsProgramAddress(
  program: anchor.Program, publicKey: anchor.web3.PublicKey
): Promise<[anchor.web3.PublicKey, number]> {
  return await anchor.web3.PublicKey.findProgramAddress(
    [
      publicKey.toBuffer(),
      Buffer.from('threads_account'),
    ],
    program.programId,
  );
}

export const ApiContextProvider = (props: PropsType): JSX.Element => {
  const { wallet } = useWallet();
  const connection = new Connection(
    'http://localhost:8899',
    'recent',
  );
  const [program, setProgram] = useState<anchor.Program | null>(null);


  useEffect(() => {
    if (wallet?.publicKey) {
      anchor.setProvider(new anchor.Provider(connection, wallet, anchor.Provider.defaultOptions()));
      const program = new anchor.Program(idl as anchor.Idl, new anchor.web3.PublicKey(idl.metadata.address));
      setProgram(program);
    }
  }, [wallet?.publicKey]);
  return (
    <ApiContext.Provider value={{
      connection: connection,
      program: program,
    }}>
      {props.children}
    </ApiContext.Provider>
  );
};

export default function useApi(): ValueType {
    return useContext(ApiContext) as ValueType;
}
