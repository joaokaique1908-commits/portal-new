async function carregarNoticias() {
    const lista = document.getElementById("lista-noticias");

    try {
        const resposta = await fetch("/api/noticias");

        if (!resposta.ok) {
            throw new Error("Não foi possível buscar as notícias.");
        }

        const noticias = await resposta.json();

        lista.replaceChildren();

        if (noticias.length === 0) {
            lista.textContent = "Ainda não há notícias cadastradas.";
            return;
        }

        noticias.forEach((noticia) => {
            const artigo = document.createElement("article");
            artigo.className = "noticia";

            const titulo = document.createElement("h3");
            titulo.textContent = noticia.titulo;

if (noticia.imagem) {
    const imagem = document.createElement("img");

    imagem.src = noticia.imagem;
    imagem.alt = noticia.titulo;
    imagem.className = "imagem-noticia";
    imagem.loading = "lazy";

    artigo.appendChild(imagem);
}

            const conteudo = document.createElement("p");
            conteudo.textContent = noticia.conteudo;

            const imagem = document.createElement("img");
            imagem.src = noticia.imagem;
            imagem.alt = noticia.titulo;

            const fonte = document.createElement("p");
            fonte.textContent = "Fonte: " + noticia.fonte;

            const status = document.createElement("p");
            status.textContent = "Status: " + noticia.status;

            const link = document.createElement("a");
            link.textContent = "Ler notícia original";
            link.href = noticia.link;
            link.target = "_blank";
            link.rel = "noopener noreferrer";

            artigo.append(titulo, conteudo, fonte, status, link);
            lista.appendChild(artigo);
        });

    } catch (erro) {
        lista.textContent = "Erro ao carregar notícias. Tente novamente.";
        console.error(erro);
    }
}

carregarNoticias();

setInterval(carregarNoticias, 60000);