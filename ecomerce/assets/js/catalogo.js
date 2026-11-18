// Catálogo da loja. Usado no navegador (vitrine/carrinho) e no servidor (pedidos e frete),
// então o preço que vale é sempre o daqui, nunca o que o navegador envia.
//
// peso em kg e dimensões em cm (embalado). Os valores abaixo são ESTIMATIVAS para os
// produtos de exemplo: confira com o produto real antes de vender, porque o frete depende deles.

export const PRODUTOS = [
    {
        id: 1, sku: 'AZ-0001', titulo: 'Smartphone Samsung Galaxy S24',
        preco: 2499.99, precoAntigo: 2999.99, categoria: 'electronics', icone: 'device-mobile',
        nota: 4.8, avaliacoes: 1234, selo: 'OFERTA',
        peso: 0.5, dimensoes: { comprimento: 20, largura: 12, altura: 7 },
    },
    {
        id: 2, sku: 'AZ-0002', titulo: 'Notebook Dell Inspiron 15',
        preco: 3299.99, precoAntigo: 3799.99, categoria: 'electronics', icone: 'laptop',
        nota: 4.6, avaliacoes: 856, selo: 'DESCONTO',
        peso: 2.6, dimensoes: { comprimento: 45, largura: 32, altura: 8 },
    },
    {
        id: 3, sku: 'AZ-0003', titulo: 'Tênis Nike Air Max',
        preco: 399.99, precoAntigo: 499.99, categoria: 'fashion', icone: 'sneaker',
        nota: 4.7, avaliacoes: 2341, selo: 'POPULAR',
        peso: 1.2, dimensoes: { comprimento: 34, largura: 22, altura: 13 },
    },
    {
        id: 4, sku: 'AZ-0004', titulo: 'Cafeteira Elétrica Philips',
        preco: 189.99, precoAntigo: 249.99, categoria: 'home', icone: 'coffee',
        nota: 4.5, avaliacoes: 567, selo: 'OFERTA',
        peso: 2.0, dimensoes: { comprimento: 30, largura: 22, altura: 32 },
    },
    {
        id: 5, sku: 'AZ-0005', titulo: 'Bicicleta Mountain Bike',
        preco: 899.99, precoAntigo: 1199.99, categoria: 'sports', icone: 'bicycle',
        nota: 4.9, avaliacoes: 234, selo: 'SUPER OFERTA',
        peso: 16, dimensoes: { comprimento: 140, largura: 22, altura: 75 },
    },
    {
        id: 6, sku: 'AZ-0006', titulo: 'Livro: O Poder do Hábito',
        preco: 29.99, precoAntigo: 39.99, categoria: 'books', icone: 'book-open',
        nota: 4.8, avaliacoes: 1567, selo: 'BESTSELLER',
        peso: 0.4, dimensoes: { comprimento: 23, largura: 16, altura: 3 },
    },
    {
        id: 7, sku: 'AZ-0007', titulo: 'LEGO Creator Expert',
        preco: 299.99, precoAntigo: 349.99, categoria: 'toys', icone: 'lego',
        nota: 4.9, avaliacoes: 789, selo: 'NOVIDADE',
        peso: 1.5, dimensoes: { comprimento: 38, largura: 26, altura: 9 },
    },
    {
        id: 8, sku: 'AZ-0008', titulo: 'Fone de Ouvido Bluetooth',
        preco: 149.99, precoAntigo: 199.99, categoria: 'electronics', icone: 'headphones',
        nota: 4.4, avaliacoes: 1890, selo: 'OFERTA',
        peso: 0.4, dimensoes: { comprimento: 20, largura: 18, altura: 8 },
    },
];

export function buscarProduto(id) {
    return PRODUTOS.find(p => p.id === Number(id)) || null;
}
