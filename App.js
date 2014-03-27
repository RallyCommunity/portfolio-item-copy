var app = null;

Ext.define('CustomApp', {
	extend: 'Rally.app.App',
	componentCls: 'app',
	layout : {
		type : "table",
		columns : 2
	},

	items:[ 
		{
			xtype : "label",
			text : 'Copy To Project:',
			padding : "5px"
		},

		{
			id : "project-picker",
			xtype: 'rallyprojectpicker',
			margin: "5px",
			model: 'Project',
			field: 'Name'
		},
		{
			xtype : "rallybutton",
			text : "Select Portfolio Item",
			margin: "5px",
			handler : function() {
				app.chooseItem();
			}
		},
		{
			id : "item-label",
			xtype : "label",
			margin : "5px",
			style : "font-weight:bold;",
			text : ""
		},
		{
			id : "copy-button",
			xtype : "rallybutton",
			text : "Copy",
			margin: "5px",
			disabled : true,
			handler : function() {
				app.performCopy();
			}
		},
		{
			id : "summary",
			xtype : "label",
			margin : "5px",
			style : "font-weight:bold;",
			text : ""
	}],

	chooseItem : function() {

		Ext.create('Rally.ui.dialog.ChooserDialog', {
			artifactTypes: ['PortfolioItem'],
			autoShow: true,
			
			title: 'Choose Item',
			listeners: {
				artifactChosen: function(selectedRecord){
					this.down("#item-label").setText(selectedRecord.get('Name'));
					this.down("#copy-button").setDisabled(true);
					app.itemSelected(selectedRecord);

				},
				scope: this
			}
		});
	},

	itemSelected : function(root) {

		var config = {   model : "PortfolioItem",
			fetch : true,
			filters : [ { property : "ObjectID", operator : "=", value: root.get("ObjectID") } ]
		};

		// create a list of all items to be copied
		async.map([config], app.wsapiQuery,function(err,results){
			var item = results[0][0];
			app.list = [];

			async.map([item],app.createList,function(err,results){
				app.models = {};
				app.types = _.uniq(_.map( app.list, function(l) { return l.get("_type");}));
				async.mapSeries(app.types,app.loadModel,function(err,results) {
					_.each(app.types,function(t,i) {
						app.models[t] = results[i];
					});
					// console.log("models:",app.models);
					app.down("#summary").setText(app.list.length + " Items to be copied");
					
					// check project selected before enabling.
					var projectRef = app.down("#project-picker").getValue();

					if (projectRef !== null && projectRef !== "")
						app.down("#copy-button").setDisabled(false);
				});
			});
		});
	},

	performCopy : function() {
		app.copyList = {};
		app.projectRef = app.down("#project-picker").getValue();
		async.mapSeries(app.list,app.copyItem,function(err,results) {
			app.down("#summary").setText(results.length + " Items copied to " + results[0].get("FormattedID"));
		});
	},

	launch: function() {
		app = this;
	},

	loadModel : function(type,callback) {

		Rally.data.ModelFactory.getModel({
			type: type,
			success: function(model) {
				callback(null,model);
			}
		});
	},

	parentRef : function(obj) {

		if ( _.isObject(obj.get("Parent"))) {
			return { type : "Parent", ref :  obj.get("Parent")._ref };
		}
		if ( _.isObject(obj.get("WorkProduct"))) {
			return { type : "WorkProduct", ref : obj.get("WorkProduct")._ref };
		}
		if ( _.isObject(obj.get("PortfolioItem"))) {
			return { type : "PortfolioItem", ref : obj.get("PortfolioItem")._ref };
		}
		return null;

	},

	copyItem : function(i,callback) {

		var copy = {
			"Name": i.get("Name"),
			"Workspace" : i.get("Workspace")._ref,
			"Description" : i.get("Description"),
			"Owner" : i.get("Owner") !== null ? i.get("Owner")._ref : null,
			"Project" : app.projectRef
		};

		var parentRef = app.parentRef(i);
		if (parentRef!==null) {
			var mappedRef = app.copyList[parentRef.ref];
			if (!_.isUndefined(mappedRef)) {
				copy[parentRef.type] = mappedRef;
			}
		}

		var model = app.models[i.get("_type")];
		async.map([{model:model,copy:copy,source:i}],app.createItem,function(err,results){
			callback(null,results[0]);
		});
	},

	createItem : function(item,callback) {
		var rec = Ext.create(item.model, item.copy );
		rec.save(
		{
			callback: function(result, operation) {
				if (_.isUndefined(operation.Errors)) {
					app.copyList[item.source.get("_ref")] = result.get("_ref");
					app.down("#summary").setText("Created " + result.get("FormattedID"));
				} else { 
					console.log("Error",operation.Errors);
				}
				callback(null,result);
			}
		});

	},

	readCollection : function( collectionConfig, callback ) {

		collectionConfig.reference.getCollection(collectionConfig.type,{fetch:true}).load({
			fetch : true,
			callback : function(records,operation,success) {
				callback(null,records);
			}
		});

	},

	isObject : function(obj) {
		return ( !_.isUndefined(obj) && !_.isNull(obj) );
	},

	defined : function (obj) {
		return (app.isObject(obj) && obj.Count > 0) ;
	},

	createList : function(root,callback) {

		var config = {   model : root.raw._type,
				fetch : true,
				filters : [ { property : "ObjectID", operator : "=", value: root.get("ObjectID") } ]
		};

		async.map([config], wsapiQuery, function(err,results) {

			var obj = results[0][0];
			app.list.push(obj);
			var childRef = null;
			if (app.defined(obj.get("Tasks"))) {
				childRef = "Tasks";
			} else {
				if (app.defined(obj.get("Children"))){
					childRef = "Children";
				} else {
					if (app.defined(obj.get("UserStories"))) {
						childRef = "UserStories";
					} 
				}
			}

			if (app.isObject(childRef)) {
				var config = { reference : obj, type : childRef };
				async.map([config],app.readCollection,function(err,results){
					var children = results[0];
					async.map(children,app.createList,function(err,results){
						callback(null,results);
					});
				});
			} else {
				callback(null,obj);
			}
		});
	},

	wsapiQuery : function( config , callback ) {
	
		Ext.create('Rally.data.WsapiDataStore', {
			autoLoad : true,
			limit : "Infinity",
			model : config.model,
			fetch : config.fetch,
			filters : config.filters,
			listeners : {
				scope : this,
				load : function(store, data) {
					callback(null,data);
				}
			}
		});
	}

});
