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
