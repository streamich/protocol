import * as anchor from '@project-serum/anchor';
import * as splToken from '@solana/spl-token';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

import { waitForFinality, Wallet_ } from '../utils';

// TODO: Switch from types to classes

/*
User metadata
*/

type Metadata = {
  deviceToken: string;
  subscriptions: Subscription[];
};

type Subscription = {
  pubkey: PublicKey;
  enabled: boolean;
};

export async function accountInfoGet(
  connection: Connection,
  publicKey: PublicKey
): Promise<anchor.web3.AccountInfo<Buffer> | null> {
  return await connection.getAccountInfo(publicKey);
}

export async function accountInfoFetch(
  _url: string,
  connection: Connection,
  publicKeyStr: string
): Promise<anchor.web3.AccountInfo<Buffer> | null> {
  const publicKey = new anchor.web3.PublicKey(publicKeyStr);
  return await accountInfoGet(connection, publicKey);
}

export async function ownerFetcher(
  _url: string,
  wallet: Wallet_,
  connection: Connection
): Promise<anchor.web3.AccountInfo<Buffer> | null> {
  const r = await accountInfoGet(connection, wallet.publicKey);
  return r;
}

export async function getMetadataProgramAddress(
  program: anchor.Program,
  user: PublicKey
): Promise<[anchor.web3.PublicKey, number]> {
  return await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from('metadata'), user.toBuffer()],
    program.programId
  );
}

// Get with keypair, for decryption
export async function getMetadata(
  program: anchor.Program,
  user: PublicKey
): Promise<Metadata> {
  const [publicKey] = await getMetadataProgramAddress(program, user);
  console.log('publicKey', publicKey);
  const metadata = await program.account.metadataAccount.fetch(publicKey);
  // console.log('metadataAccount', metadataAccount);
  return {
    deviceToken: new TextDecoder().decode(new Uint8Array(metadata.deviceToken)),
    subscriptions: [],
  } as Metadata;
}

export async function createMetadata(
  program: anchor.Program,
  user: Keypair,
  deviceToken: string
): Promise<Metadata> {
  const [metadataAddress, metadataNonce] = await getMetadataProgramAddress(
    program,
    user.publicKey
  );
  const tx = await program.rpc.createMetadata(
    new anchor.BN(metadataNonce),
    Buffer.from(deviceToken),
    {
      accounts: {
        user: user.publicKey,
        metadata: metadataAddress,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [user],
    }
  );
  await waitForFinality(program, tx);
  return await getMetadata(program, user.publicKey);
}

/*
Dialect
*/

type Dialect = {
  members: Member[];
  messages: Message[];
  nextMessageIdx: number;
  lastMessageTimestamp: number;
};

type DialectAccount = anchor.web3.AccountInfo<Buffer> & {
  dialect: Dialect;
  publicKey: PublicKey;
};

export async function getDialectProgramAddress(
  program: anchor.Program,
  members: Member[]
): Promise<[anchor.web3.PublicKey, number]> {
  return await anchor.web3.PublicKey.findProgramAddress(
    [
      Buffer.from('dialect'),
      ...members // sort for deterministic PDA
        .map((m) => m.publicKey.toBuffer())
        .sort((a, b) => a.compare(b)), // TODO: test that buffers sort as expected
    ],
    program.programId
  );
}

type RawMessage = {
  owner: PublicKey;
  text: number[];
  timestamp: number;
};

export async function getDialect(
  program: anchor.Program,
  publicKey: PublicKey
): Promise<DialectAccount> {
  const dialect = await program.account.dialectAccount.fetch(publicKey);
  const account = await program.provider.connection.getAccountInfo(publicKey);
  return {
    ...account,
    publicKey,
    // dialect,
    dialect: {
      ...dialect,
      lastMessageTimestamp: dialect.lastMessageTimestamp * 1000,
      messages:
        dialect.messages.map(
          (m: RawMessage | null) =>
            m && {
              ...m,
              text: new TextDecoder().decode(
                new Uint8Array(m.text.slice(0, m.text.indexOf(0)))
              ),
              timestamp: m.timestamp * 1000,
            }
        ) || null,
    },
  } as DialectAccount;
}

export async function getDialectForMembers(
  program: anchor.Program,
  members: Member[]
): Promise<DialectAccount> {
  const sortedMembers = members.sort((a, b) =>
    a.publicKey.toBuffer().compare(b.publicKey.toBuffer())
  );
  const [publicKey] = await getDialectProgramAddress(program, sortedMembers);
  return await getDialect(program, publicKey);
}

export async function createDialect(
  program: anchor.Program,
  owner: anchor.web3.Keypair,
  members: Member[]
): Promise<DialectAccount> {
  const sortedMembers = members.sort((a, b) =>
    a.publicKey.toBuffer().compare(b.publicKey.toBuffer())
  );
  const [publicKey, nonce] = await getDialectProgramAddress(
    program,
    sortedMembers
  );
  // TODO: assert owner in members
  const keyedMembers = sortedMembers.reduce(
    (ms, m, idx) => ({ ...ms, [`member${idx}`]: m.publicKey }),
    {}
  );
  const tx = await program.rpc.createDialect(
    new anchor.BN(nonce),
    sortedMembers.map((m) => m.scopes),
    {
      accounts: {
        dialect: publicKey,
        owner: owner.publicKey,
        ...keyedMembers,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [owner],
    }
  );
  await waitForFinality(program, tx);
  return await getDialectForMembers(program, members);
}

/*
Mint Dialect
*/

type MintDialect = {
  mint: PublicKey;
};

type MintDialectAccount = anchor.web3.AccountInfo<Buffer> & {
  dialect: MintDialect;
  publicKey: PublicKey;
};

export async function getMintDialectProgramAddress(
  program: anchor.Program,
  mint: splToken.Token
): Promise<[anchor.web3.PublicKey, number]> {
  return await anchor.web3.PublicKey.findProgramAddress(
    [Buffer.from('dialect'), mint.publicKey.toBuffer()],
    program.programId
  );
}

export async function getMintDialect(
  program: anchor.Program,
  mint: splToken.Token
): Promise<MintDialectAccount> {
  const [publicKey] = await getMintDialectProgramAddress(program, mint);
  const dialect = await program.account.mintDialectAccount.fetch(publicKey);
  const account = await program.provider.connection.getAccountInfo(publicKey);
  return {
    ...account,
    publicKey,
    dialect,
  } as MintDialectAccount;
}

export async function createMintDialect(
  program: anchor.Program,
  mint: splToken.Token,
  mintAuthority: anchor.web3.Keypair
): Promise<MintDialectAccount> {
  const [publicKey, nonce] = await getMintDialectProgramAddress(program, mint);
  const tx = await program.rpc.createMintDialect(new anchor.BN(nonce), {
    accounts: {
      dialect: publicKey,
      mint: mint.publicKey,
      mintAuthority: mintAuthority.publicKey,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      systemProgram: anchor.web3.SystemProgram.programId,
    },
    signers: [mintAuthority],
  });
  await waitForFinality(program, tx);
  return await getMintDialect(program, mint);
}

/*
Members
*/

export type Member = {
  publicKey: anchor.web3.PublicKey;
  scopes: [boolean, boolean];
};

/*
Messages
*/

type Message = {
  owner: PublicKey;
  text: string;
  timestamp: number;
};

type MessagesAccount = anchor.web3.AccountInfo<Buffer> & {
  messages: Message[];
  publicKey: PublicKey;
};

export async function sendMessage(
  program: anchor.Program,
  dialect: DialectAccount,
  sender: anchor.web3.Keypair,
  text: string
): Promise<Message> {
  const [dialectPublicKey, nonce] = await getDialectProgramAddress(
    program,
    dialect.dialect.members
  );

  const intArray = Array(32).fill(0);
  const charArray = Buffer.from(text);
  for (let i = 0; i < charArray.length; i++) {
    intArray[i] = charArray[i];
  }

  await program.rpc.sendMessage(
    new anchor.BN(nonce),
    new Uint8Array(intArray),
    {
      accounts: {
        dialect: dialectPublicKey,
        sender: sender.publicKey,
        member0: dialect.dialect.members[0].publicKey,
        member1: dialect.dialect.members[1].publicKey,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [sender],
    }
  );

  const d = await getDialect(program, dialect.publicKey);
  return d.dialect.messages[d.dialect.nextMessageIdx - 1]; // TODO: Support ring
}
