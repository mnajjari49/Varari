{
    'name': 'POS Order And Line Notes',
    'summary': """POS Order/Line Notes""",
    'version': '1.0',
    'description': """POS Order/Line Notes""",
    'author': 'Ecotech',
    'category': 'Point of Sale',
    'depends': ['base', 'point_of_sale', 'ecotech_pos_laundry'],
    'data': [
        'security/ir.model.access.csv',
    	'views/import.xml',
    	'views/pos_config.xml',
        'views/pos_order.xml',
    ],
    'qweb': ['static/src/xml/*.xml'],
    'images': ['static/description/banner.png'],
    'demo': [],    
    'installable': True,
    'application': True,
    'auto_install': False,

}
