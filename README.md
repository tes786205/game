# Game

Fonte: https://github.com/phaserjs/template-parcel-ts

## Integração com a Feira de Jogos

A Feira de Jogos usa OAuth 2.0 do Google para autenticação dos usuários. É usada a biblioteca fornecida pelo provedor de identidade no arquivo `index.html`:

```html
<script src="https://accounts.google.com/gsi/client" async></script>
```

Como é uma biblioteca a parte do jogo, pode-se definir os tipos `google.accounts` com a dependência de desenvolvedor `@types/google.accounts` e aplicar no arquivo `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["google.accounts"]
  }
}
```

Assim, é possível definir a cena final, de _game over_, para autenticar o usuário e adicionar crédito na sua conta da feira. Exemplo:

```js
import { Scene } from "phaser";
import axios from "axios";

export class GameOver extends Scene {
  constructor() {
    super("GameOver");
  }

  create() {
    google.accounts.id.initialize({
      client_id:
        "331191695151-ku8mdhd76pc2k36itas8lm722krn0u64.apps.googleusercontent.com",
      callback: (res: any) => {
        if (res.error) {
          console.error(res.error);
        } else {
          axios
            .post(
              "https://feira-de-jogos.dev.br/api/v2/credit",
              {
                product: 1, // id do jogo cadastrado no banco de dados da Feira de Jogos
                value: 100, // crédito em tijolinhos
              },
              {
                headers: {
                  Authorization: `Bearer ${res.credential}`,
                },
              },
            )
            .then(function (response: any) {
              console.log(response);
              alert("Crédito adicionado!");
            })
            .catch(function (error: any) {
              console.error(error);
              alert("Erro ao adicionar crédito :(");
            });
        }
      },
    });

    google.accounts.id.prompt();
  }
}
```

Para facilitar, foi usado `axios` para processar as respostas da requisição `POST` de crédito.

Detalhe para dois parâmetros que devem ser personalizados jogo a jogo:

1. `product`: identificação do produto na feira;
1. `value`: quantidade de crédito.